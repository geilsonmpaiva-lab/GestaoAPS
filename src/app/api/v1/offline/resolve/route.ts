import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireActor,createSupabaseServerClient,isDemoMode } from '@/lib/server/supabase';
import { loadWorkspaceContext } from '@/lib/server/workspace';
import { commandError } from '@/lib/server/command-response';
const schema=z.object({operationId:z.uuid(),sourceOperationId:z.uuid(),entityId:z.uuid(),expectedVersion:z.number().int().positive(),strategy:z.enum(['KEEP_SERVER','KEEP_CLIENT']),justification:z.string().trim().min(10).max(1000),client:z.object({status:z.enum(['NAO_INICIADO','EM_ANDAMENTO','BLOQUEADO']).optional(),percentage:z.number().int().min(0).max(99).optional(),blockedReason:z.string().max(2000).optional()})});
export async function POST(request:Request){
  if(!await requireActor())return NextResponse.json({error:'Não autenticado.'},{status:401});
  const input=schema.safeParse(await request.json().catch(()=>null));if(!input.success)return NextResponse.json({error:'Resolução inválida.'},{status:422});
  const workspace=await loadWorkspaceContext();
  const can=(op:string)=>workspace.permissions.some(p=>(p.domain==='*'||p.domain==='melhoria')&&(p.operations.includes('*')||p.operations.includes(op)));
  if(!can('reabrir')||!can('editar'))return NextResponse.json({error:'Seu perfil não permite resolver este conflito.'},{status:403});
  if(isDemoMode())return NextResponse.json({mode:'demo'});
  const client=await createSupabaseServerClient();
  let query=client.from('actions').select('id,unit_id,status,version').eq('id',input.data.entityId).eq('organization_id',workspace.organizationId).is('deleted_at',null);
  if(workspace.unitId)query=query.eq('unit_id',workspace.unitId);
  const action=await query.maybeSingle();
  if(action.error||!action.data)return NextResponse.json({error:'Ação não encontrada.'},{status:404});
  if(['CONCLUIDO','CANCELADO'].includes(action.data.status))return NextResponse.json({error:'Ação encerrada. Revisão manual necessária.'},{status:409});
  const payload={...(input.data.strategy==='KEEP_CLIENT'?input.data.client:{}),comment:`Resolução offline ${input.data.sourceOperationId} (${input.data.strategy}): ${input.data.justification}`};
  // Preview-only adapter; production keeps the original command and deployment.
  if(process.env.SGC_ENVIRONMENT!=='staging')return NextResponse.json({error:'Resolução disponível somente na homologação.'},{status:403});
  const result=await client.rpc('staging_update_action',{p_action_id:input.data.entityId,p_expected_version:input.data.expectedVersion,p_operation_id:input.data.operationId,p_payload:payload});
  return result.error?commandError(result.error):NextResponse.json(result.data);
}
