import{NextResponse}from"next/server";import{z}from"zod";import{createSupabaseServerClient,isDemoMode,requireActor}from"@/lib/server/supabase";
import { loadWorkspaceContext } from '@/lib/server/workspace';
const schema=z.object({attachmentId:z.uuid(),organizationId:z.uuid(),unitId:z.uuid().nullable(),entityType:z.string().trim().min(1).max(80),entityId:z.uuid(),evidenceKind:z.string().trim().max(120).optional(),fileName:z.string().trim().min(1).max(240),contentType:z.enum(["application/pdf","image/jpeg","image/png","text/csv","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]),byteSize:z.number().int().min(1).max(26214400),sha256:z.string().regex(/^[a-fA-F0-9]{64}$/),classification:z.enum(["PUBLIC_INSTITUTIONAL","INTERNAL","RESTRICTED"])});
export async function POST(request:Request){
  const actor=await requireActor();if(!actor)return NextResponse.json({error:'Não autenticado.'},{status:401});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:'Metadados da evidência inválidos.',issues:parsed.error.issues},{status:422});
  const input=parsed.data;
  const safeName=input.fileName.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(-160)||'evidence';
  const path=`${input.organizationId}/${input.unitId??'organization'}/${input.classification.toLowerCase()}/${input.entityType}/${input.entityId}/${input.attachmentId}-${safeName}`;
  if(isDemoMode())return NextResponse.json({attachmentId:input.attachmentId,path,token:'demo-upload-token',signedUrl:`/api/v1/evidence/${input.attachmentId}/demo-upload`,mode:'demo'},{status:201});
  const client=await createSupabaseServerClient();
  const workspace=await loadWorkspaceContext();
  if(workspace.organizationId!==input.organizationId||(workspace.unitId&&input.unitId&&workspace.unitId!==input.unitId)||!workspace.permissions.some(p=>(p.domain==='*'||p.domain==='evidencias')&&(p.operations.includes('*')||p.operations.includes('criar'))))return NextResponse.json({error:'Escopo ou permissão de evidência inválidos.'},{status:403});
  const existing=await client.from('attachments').select('id,created_by,organization_id,unit_id,object_path,file_name,content_type,byte_size,sha256,classification,status').eq('id',input.attachmentId).is('deleted_at',null).maybeSingle();
  if(existing.error)return NextResponse.json({error:'Falha ao consultar reserva.'},{status:422});
  const row=existing.data;
  if(row){
    if(row.created_by!==actor.id||row.organization_id!==input.organizationId||row.unit_id!==input.unitId||row.object_path!==path||row.file_name!==input.fileName||row.content_type!==input.contentType||Number(row.byte_size)!==input.byteSize||row.sha256.toLowerCase()!==input.sha256.toLowerCase()||row.classification!==input.classification)return NextResponse.json({error:'A reserva existente possui outros dados. Nenhum arquivo foi substituído.'},{status:409});
    if(row.status==='AVAILABLE')return NextResponse.json({attachmentId:row.id,status:'AVAILABLE'},{headers:{'cache-control':'no-store'}});
    if(row.status!=='PENDING')return NextResponse.json({error:'Reserva indisponível para retomada.'},{status:409});
  }else{
    const {error}=await client.rpc('reserve_attachment',{p_attachment_id:input.attachmentId,p_organization_id:input.organizationId,p_unit_id:input.unitId,p_object_path:path,p_file_name:input.fileName,p_content_type:input.contentType,p_byte_size:input.byteSize,p_sha256:input.sha256,p_classification:input.classification,p_entity_type:input.entityType,p_entity_id:input.entityId,p_evidence_kind:input.evidenceKind??null});
    if(error)return NextResponse.json({error:'Não foi possível reservar e vincular a evidência.',code:error.code},{status:error.code==='42501'?403:422});
  }
  const {data,error}=await client.storage.from('evidence').createSignedUploadUrl(path);
  return error?NextResponse.json({error:'Não foi possível gerar URL de upload.'},{status:422}):NextResponse.json({attachmentId:input.attachmentId,...data},{status:201,headers:{'cache-control':'no-store'}});
}
