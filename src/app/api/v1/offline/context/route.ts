import { NextResponse } from "next/server";
import { requireActor,createSupabaseServerClient,isDemoMode } from "@/lib/server/supabase";
import { loadWorkspaceContext } from "@/lib/server/workspace";
export async function GET(){
  const actor=await requireActor();
  if(!actor)return NextResponse.json({error:'Não autenticado.'},{status:401});
  if(!isDemoMode()){
    const client=await createSupabaseServerClient();
    const profile=await client.from('profiles').select('status').eq('id',actor.id).maybeSingle();
    if(profile.error)return NextResponse.json({error:'Não foi possível conferir o perfil.'},{status:503});
    if(profile.data?.status!=='ACTIVE')return NextResponse.json({error:'Perfil sem autorização.'},{status:403});
  }
  return NextResponse.json(await loadWorkspaceContext(),{headers:{'cache-control':'private, no-store'}});
}
