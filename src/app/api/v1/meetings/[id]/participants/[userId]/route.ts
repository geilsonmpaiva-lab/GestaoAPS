import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient, isDemoMode, requireActor } from "@/lib/server/supabase";

const schema=z.object({attended:z.boolean().nullable()});
export async function PUT(request:Request,context:{params:Promise<{id:string;userId:string}>}) {
  if(!await requireActor()) return NextResponse.json({error:"Não autenticado."},{status:401});
  const {id,userId}=await context.params; const body=schema.safeParse(await request.json().catch(()=>null));
  if(!z.uuid().safeParse(id).success||!z.uuid().safeParse(userId).success||!body.success) return NextResponse.json({error:"Presença inválida."},{status:422});
  if(isDemoMode()) return NextResponse.json({id:crypto.randomUUID(),meetingId:id,userId,attended:body.data.attended,mode:"demo"});
  const client=await createSupabaseServerClient(); const {data:meeting,error:meetingError}=await client.from("meetings").select("organization_id,unit_id,status").eq("id",id).single();
  if(meetingError||!meeting) return NextResponse.json({error:"Reunião não encontrada."},{status:404});
  if(meeting.status==="COMPLETED"||meeting.status==="CANCELLED") return NextResponse.json({error:"A presença não pode mais ser alterada."},{status:409});
  const row={organization_id:meeting.organization_id,unit_id:meeting.unit_id,meeting_id:id,user_id:userId,attended:body.data.attended};
  const {data,error}=await client.from("meeting_participants").upsert(row,{onConflict:"meeting_id,user_id"}).select("*").single();
  if(error) return NextResponse.json({error:"Não foi possível registrar a presença.",code:error.code},{status:error.code==="42501"?403:422});
  return NextResponse.json(data);
}
