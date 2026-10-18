import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { runtimeMode } from "@/lib/runtime-mode";
import { canUseStaging } from "@/lib/staging-access";

export function isDemoMode() {
  return runtimeMode() === "demo";
}

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase não configurado.");

  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components não podem gravar cookies; o middleware renova a sessão.
        }
      }
    }
  });
}

export async function requireActor() {
  if (isDemoMode()) return { id: "00000000-0000-4000-8000-000000000001", email: "ana.lima@demo.sgc.local", demo: true };
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  if (!await canUseStaging(client, data.user.id)) return null;
  return { id: data.user.id, email: data.user.email ?? "", demo: false };
}
