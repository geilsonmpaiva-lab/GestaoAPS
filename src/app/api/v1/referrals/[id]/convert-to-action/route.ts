import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema=z.object({operationId:z.uuid(),expectedVersion:z.number().int().positive()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  if(!await requireActor()) return NextResponse.json({error:"Não autenticado."},{status:401});
  const {id}=await context.params; const body=schema.safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!body.success) return NextResponse.json({error:"Conversão inválida."},{status:422});
  if(isDemoMode()) return NextResponse.json({id,status:"IN_PROGRESS",version:body.data.expectedVersion+1,actionPlanId:crypto.randomUUID(),actionId:crypto.randomUUID(),mode:"demo"});
  const client=await createSupabaseServerClient();
  const {data,error}=await client.rpc("convert_referral_to_action",{p_referral_id:id,p_expected_version:body.data.expectedVersion,p_operation_id:body.data.operationId});
  return error?commandError(error):NextResponse.json(data);
}
