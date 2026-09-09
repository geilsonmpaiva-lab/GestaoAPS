import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient,isDemoMode,requireActor } from "@/lib/server/supabase";
const criterion=z.object({id:z.string().trim().min(1).max(80),compliant:z.boolean(),notes:z.string().trim().max(4000).optional(),evidenceAttachmentIds:z.array(z.uuid()).max(20).default([])});
const schema=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive(),result:z.object({criteria:z.array(criterion).min(1).max(300),summary:z.string().trim().max(10000).optional()})});
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
  if(!await requireActor())return NextResponse.json({error:"Não autenticado."},{status:401}); const {id}=await context.params; const body=schema.safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!body.success)return NextResponse.json({error:"Resultado de auditoria inválido.",issues:body.success?undefined:body.error.issues},{status:422});
  const failed=body.data.result.criteria.filter((item)=>!item.compliant).length; if(isDemoMode())return NextResponse.json({id,status:"COMPLETED",version:body.data.expectedVersion+1,failedCriteria:failed,nonconformityId:failed?crypto.randomUUID():null,actionPlanId:failed?crypto.randomUUID():null,mode:"demo"});
  const client=await createSupabaseServerClient(); const {data,error}=await client.rpc("complete_audit_execution",{p_execution_id:id,p_expected_version:body.data.expectedVersion,p_operation_id:body.data.operationId,p_result:body.data.result}); return error?commandError(error):NextResponse.json(data);
}
