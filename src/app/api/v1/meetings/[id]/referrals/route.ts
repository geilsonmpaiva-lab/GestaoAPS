import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema=z.object({agendaItemId:z.uuid().nullable().optional(),description:z.string().trim().min(3).max(4000),responsibleId:z.uuid().nullable().optional(),dueAt:z.iso.datetime({offset:true}).nullable().optional(),priority:z.enum(["LOW","NORMAL","HIGH","CRITICAL"]).default("NORMAL")});
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const actor=await requireActor(); if(!actor) return NextResponse.json({error:"Não autenticado."},{status:401});
  const {id}=await context.params; const body=schema.safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!body.success) return NextResponse.json({error:"Encaminhamento inválido."},{status:422});
  if(isDemoMode()) return NextResponse.json({id:crypto.randomUUID(),meetingId:id,...body.data,status:"OPEN",version:1,mode:"demo"},{status:201});
  const client=await createSupabaseServerClient(); const {data:meeting,error:meetingError}=await client.from("meetings").select("organization_id,unit_id,status").eq("id",id).single();
  if(meetingError||!meeting) return NextResponse.json({error:"Reunião não encontrada."},{status:404});
  if(meeting.status==="COMPLETED"||meeting.status==="CANCELLED") return NextResponse.json({error:"A reunião não aceita novos encaminhamentos."},{status:409});
  const {data,error}=await client.from("referrals").insert({organization_id:meeting.organization_id,unit_id:meeting.unit_id,meeting_id:id,agenda_item_id:body.data.agendaItemId,description:body.data.description,responsible_id:body.data.responsibleId,due_at:body.data.dueAt,priority:body.data.priority,created_by:actor.id,updated_by:actor.id}).select("*").single();
  if(error) return NextResponse.json({error:"Não foi possível criar o encaminhamento.",code:error.code},{status:error.code==="42501"?403:422});
  return NextResponse.json(data,{status:201});
}
