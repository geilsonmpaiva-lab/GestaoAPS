import { NextResponse } from "next/server";
import { z } from "zod";
import { commandError } from "@/lib/server/command-response";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema=z.object({organizationId:z.uuid(),unitId:z.uuid().nullable(),key:z.enum(["ux_mvp_v2","reunioes","qualidade","pessoas","patrimonio","estoque","seguranca","ouvidoria","safety_events","ombudsman","module.reunioes","module.qualidade","module.pessoas","module.patrimonio","module.estoque","module.seguranca","module.ouvidoria"]),enabled:z.boolean(),reason:z.string().trim().max(2000).default("")});
export async function POST(request:Request){if(!await requireActor())return NextResponse.json({error:"Não autenticado."},{status:401});const body=schema.safeParse(await request.json().catch(()=>null));if(!body.success)return NextResponse.json({error:"Feature flag inválida.",issues:body.error.issues},{status:422});if(isDemoMode())return NextResponse.json({...body.data,mode:"demo"});const c=await createSupabaseServerClient();const{data,error}=await c.rpc("set_feature_flag",{p_organization_id:body.data.organizationId,p_unit_id:body.data.unitId,p_key:body.data.key,p_enabled:body.data.enabled,p_reason:body.data.reason});return error?commandError(error):NextResponse.json(data);}
