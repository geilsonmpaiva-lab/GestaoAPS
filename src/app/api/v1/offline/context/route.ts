import { NextResponse } from "next/server";
import { requireActor,createSupabaseServerClient,isDemoMode } from "@/lib/server/supabase";
import { loadWorkspaceContext } from "@/lib/server/workspace";
import { isOfflineAuthorization, RESTRICTED_OFFLINE_ORGANIZATION } from "@/lib/offline/authorization";
export async function GET(){
  const headers={'cache-control':'private, no-store'};
  const actor=await requireActor();
  if(!actor)return NextResponse.json({error:'Não autenticado.'},{status:401,headers});
  const client=isDemoMode()?null:await createSupabaseServerClient();
  if(client){
    const profile=await client.from('profiles').select('status').eq('id',actor.id).maybeSingle();
    if(profile.error)return NextResponse.json({error:'Não foi possível conferir o perfil.'},{status:503,headers});
    if(profile.data?.status!=='ACTIVE')return NextResponse.json({error:'Perfil sem autorização.'},{status:403,headers});
  }
  const workspace=await loadWorkspaceContext();
  if(client){
    if(workspace.userId!==actor.id)return NextResponse.json({error:'Perfil sem autorização.'},{status:403,headers});
    if(workspace.organizationId===RESTRICTED_OFFLINE_ORGANIZATION){
      try{
        const result=await client.rpc('staging_own_offline_authorization_v1',{p_organization_id:workspace.organizationId});
        if(result.error)return NextResponse.json({error:'Não foi possível conferir as permissões específicas do cofre.'},{status:result.error.code==='42501'?403:503,headers});
        if(!isOfflineAuthorization(result.data)||result.data.userId!==actor.id||result.data.organizationId!==workspace.organizationId)return NextResponse.json({error:'A autorização específica do cofre não pôde ser confirmada.'},{status:503,headers});
        // Only the validated digest is projected; no grant rows or patient fields leave this endpoint.
        return NextResponse.json({...workspace,offlineAuthorization:{version:1,userId:actor.id,organizationId:workspace.organizationId,digest:result.data.digest}},{headers});
      }catch{return NextResponse.json({error:'Não foi possível conferir as permissões específicas do cofre.'},{status:503,headers});}
    }
  }
  return NextResponse.json(workspace,{headers});
}
