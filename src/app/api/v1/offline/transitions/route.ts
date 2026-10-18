import {NextResponse} from 'next/server';
import {requireActor,isDemoMode,createSupabaseServerClient} from '@/lib/server/supabase';
import {loadWorkspaceContext} from '@/lib/server/workspace';
import {commandError} from '@/lib/server/command-response';
import {transitionEnvelope,validateTransition} from '@/lib/offline/transitions';
export async function POST(request:Request){
 if(process.env.SGC_ENVIRONMENT!=='staging')return NextResponse.json({error:'Transições offline disponíveis somente na homologação.'},{status:403});
 if(!await requireActor())return NextResponse.json({error:'Não autenticado.'},{status:401});
 const text=await request.text();if(text.length>500000)return NextResponse.json({error:'Operação muito extensa.'},{status:413});
 let raw:unknown;try{raw=JSON.parse(text);}catch{return NextResponse.json({error:'Comando inválido.'},{status:422});}
 const parsed=transitionEnvelope.safeParse(raw);
 if(!parsed.success||!validateTransition(parsed.data))return NextResponse.json({error:'Transição inválida. Revise os campos antes de preparar outra operação.'},{status:422});
 const input=parsed.data;const workspace=await loadWorkspaceContext();
 const domain=input.resource==='knowledge-versions'?'conhecimento':['protocol-versions','executions'].includes(input.resource)?'protocolos':['meetings','referrals'].includes(input.resource)?'reunioes':'melhoria';
 if(!workspace.enabledModules.includes(domain))return NextResponse.json({error:'Módulo indisponível neste contexto.'},{status:403});
 if(input.organizationId!==workspace.organizationId||input.unitId!==workspace.unitId||request.headers.get('x-device-id')!==input.deviceId)return NextResponse.json({error:'Escopo ou dispositivo divergente.'},{status:403});
 if(isDemoMode())return NextResponse.json({mode:'demo'});
 const client=await createSupabaseServerClient();
 const result=await client.rpc('staging_offline_transition',{p_request:input});
 if(result.error){if(['40P01','55P03'].includes(result.error.code))return NextResponse.json({error:'Registro ocupado. Sua operação foi preservada para nova tentativa.'},{status:503});return commandError(result.error);}
 return NextResponse.json(result.data,{status:result.data.status==='conflict'?409:200,headers:{'cache-control':'no-store'}});
}
