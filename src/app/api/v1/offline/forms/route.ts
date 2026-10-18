import {NextResponse} from 'next/server';
import {requireActor,isDemoMode,createSupabaseServerClient} from '@/lib/server/supabase';
import {loadWorkspaceContext} from '@/lib/server/workspace';
import {commandError} from '@/lib/server/command-response';
import {formEnvelope,validateForm,formDefinition} from '@/lib/offline/forms';
export async function POST(request:Request){
 if(process.env.SGC_ENVIRONMENT!=='staging')return NextResponse.json({error:'Formulários offline disponíveis somente na homologação.'},{status:403});
 if(!await requireActor())return NextResponse.json({error:'Não autenticado.'},{status:401});
 const text=await request.text();if(new TextEncoder().encode(text).length>500000)return NextResponse.json({error:'Operação muito extensa.'},{status:413});
 let raw:unknown;try{raw=JSON.parse(text);}catch{return NextResponse.json({error:'Comando inválido.'},{status:422});}
 const parsed=formEnvelope.safeParse(raw);
 if(!parsed.success||!validateForm(parsed.data))return NextResponse.json({error:'Formulário inválido. Revise os campos; a cópia local foi preservada.'},{status:422});
 const input=parsed.data,workspace=await loadWorkspaceContext();
 input.payload=formDefinition(input)!.schema.parse(input.payload);
 const domain=input.resource==='knowledge'?'conhecimento':['protocols','protocol-versions','executions'].includes(input.resource)?'protocolos':['indicators','measurements'].includes(input.resource)?'indicadores':input.resource==='meetings'?'reunioes':'melhoria';
 if(!workspace.enabledModules.includes(domain)||input.command==='open-plan'&&!workspace.enabledModules.includes('melhoria'))return NextResponse.json({error:'Módulo indisponível neste contexto.'},{status:403});
 if(input.organizationId!==workspace.organizationId||input.unitId!==workspace.unitId||request.headers.get('x-device-id')!==input.deviceId)return NextResponse.json({error:'Escopo ou dispositivo divergente.'},{status:403});
 if(isDemoMode())return NextResponse.json({mode:'demo'});
 const client=await createSupabaseServerClient();
 const {data,error}=await client.rpc('staging_offline_form',{p_request:input});
 if(error){if(['40P01','55P03'].includes(error.code))return NextResponse.json({error:'Registro ocupado. Operação preservada para nova tentativa.'},{status:503});return commandError(error);}
 return NextResponse.json(data,{status:data.status==='conflict'?409:200,headers:{'cache-control':'no-store'}});
}
