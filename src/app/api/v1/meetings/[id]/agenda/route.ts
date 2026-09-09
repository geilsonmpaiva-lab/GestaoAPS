import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema=z.object({position:z.number().int().min(1).max(999),title:z.string().trim().min(3).max(240),description:z.string().trim().max(4000).optional()});
export async function POST(request:Request,context:{params:Promise<{id:string}>}) {
  const actor=await requireActor(); if(!actor) return NextResponse.json({error:"Não autenticado."},{status:401});
  const {id}=await context.params; const body=schema.safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!body.success) return NextResponse.json({error:"Item de pauta inválido."},{status:422});
  if(isDemoMode()) return NextResponse.json({id:crypto.randomUUID(),meetingId:id,...body.data,version:1,mode:"demo"},{status:201});
  const client=await createSupabaseServerClient(); const {data:meeting,error:meetingError}=await client.from("meetings").select("organization_id,unit_id,status").eq("id",id).single();
  if(meetingError||!meeting) return NextResponse.json({error:"Reunião não encontrada."},{status:404});
  if(meeting.status==="COMPLETED"||meeting.status==="CANCELLED") return NextResponse.json({error:"A pauta não pode mais ser alterada."},{status:409});
  const {data,error}=await client.from("meeting_agenda_items").insert({organization_id:meeting.organization_id,unit_id:meeting.unit_id,meeting_id:id,position:body.data.position,title:body.data.title,description:body.data.description,created_by:actor.id,updated_by:actor.id}).select("*").single();
  if(error) return NextResponse.json({error:"Não foi possível incluir o item de pauta.",code:error.code},{status:error.code==="42501"?403:422});
  return NextResponse.json(data,{status:201});
}
