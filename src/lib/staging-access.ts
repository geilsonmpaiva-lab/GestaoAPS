import type { SupabaseClient } from "@supabase/supabase-js";

/** Preview sessions are restricted to the explicitly configured synthetic tenant. */
export async function canUseStaging(client: SupabaseClient, userId: string) {
  if (process.env.SGC_ENVIRONMENT !== "staging") return true;
  const organizationId = process.env.SGC_STAGING_ORGANIZATION_ID;
  if (!organizationId || !/^[0-9a-f-]{36}$/i.test(organizationId)) return false;
  const now = new Date().toISOString();
  const { data, error } = await client.from("memberships").select("id")
    .eq("user_id", userId).eq("organization_id", organizationId)
    .lte("starts_at", now).or(`ends_at.is.null,ends_at.gt.${now}`).limit(1).maybeSingle();
  return !error && Boolean(data);
}
