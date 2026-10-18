import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
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
  const device=(await headers()).get('x-device-id');
  if(device){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(device))return null;
    const registered=await client.from('devices').select('organization_id').eq('id',device).eq('user_id',data.user.id).is('revoked_at',null).gt('last_verified_at',new Date(Date.now()-72*60*60*1000).toISOString()).maybeSingle();
    if(registered.error||!registered.data)return null;
    const profile=await client.from('profiles').select('status').eq('id',data.user.id).eq('status','ACTIVE').maybeSingle();
    if(profile.error||!profile.data)return null;
    const membership=await client.from('memberships').select('id').eq('user_id',data.user.id).eq('organization_id',registered.data.organization_id).lte('starts_at',new Date().toISOString()).or(`ends_at.is.null,ends_at.gt.${new Date().toISOString()}`).limit(1).maybeSingle();
    if(membership.error||!membership.data)return null;
  }
  return { id: data.user.id, email: data.user.email ?? "", demo: false };
}
