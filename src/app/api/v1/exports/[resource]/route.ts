import ExcelJS from "exceljs";
import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {modules} from "@/lib/modules";
import {safeSpreadsheetValue,toCsv} from "@/lib/server/export";
import {createSupabaseServerClient,isDemoMode,requireActor} from "@/lib/server/supabase";

const definitions:Record<string,{table:string;columns:string[];demo?:string;sensitive?:boolean}>={
  protocols:{table:"protocols",columns:["id","code","title","domain","status","version","created_at","updated_at"],demo:"protocolos"},
  indicators:{table:"indicators",columns:["id","code","name","unit","periodicity","domain","status","version"],demo:"indicadores"},
  actions:{table:"actions",columns:["id","action_plan_id","what","where_text","when_at","status","percentage","version"]},
  meetings:{table:"meetings",columns:["id","title","starts_at","ends_at","location","status","version"],demo:"reunioes"},
  audits:{table:"audit_executions",columns:["id","model_version_id","auditor_id","scheduled_at","started_at","completed_at","status","version"],demo:"qualidade"},
  people:{table:"professionals",columns:["id","name","category","role_name","employment_type","weekly_hours","status","version"],demo:"pessoas"},
  assets:{table:"assets",columns:["id","asset_code","name","category","location","condition","status","version"],demo:"patrimonio"},
  inventory:{table:"inventory_items",columns:["id","code","name","category","minimum_stock","unit_of_measure","status","version"],demo:"estoque"},
  "safety-events":{table:"safety_events",columns:["id","event_at","notified_at","location","event_type","harm_classification","status","action_plan_id","version"],sensitive:true},
  ombudsman:{table:"ombudsman_cases",columns:["id","channel","received_at","manifestation_type","subject","priority","due_at","status","action_plan_id","version"],sensitive:true}
};
export const dynamic="force-dynamic";
export async function GET(request:NextRequest,context:{params:Promise<{resource:string}>}){
  if(!await requireActor())return NextResponse.json({error:"Não autenticado."},{status:401});const{resource}=await context.params;const definition=definitions[resource];if(!definition)return NextResponse.json({error:"Exportação não disponível."},{status:404});
  const format=request.nextUrl.searchParams.get("format")||"xlsx";if(!["csv","xlsx"].includes(format))return NextResponse.json({error:"Formato inválido."},{status:422});const unitId=request.nextUrl.searchParams.get("unitId");if(unitId&&!z.uuid().safeParse(unitId).success)return NextResponse.json({error:"UBS inválida."},{status:422});
  let rows:Record<string,unknown>[]=[];
  if(isDemoMode()){rows=(definition.demo?modules[definition.demo].records:[]).map((row)=>({...row}));}
  else{const client=await createSupabaseServerClient();if(definition.sensitive){if(!unitId)return NextResponse.json({error:"Selecione uma UBS para exportar dados restritos."},{status:422});const device=request.headers.get("x-device-id");const{data,error}=await client.rpc("read_sensitive_records",{p_entity_type:definition.table,p_unit_id:unitId,p_limit:50,p_device_id:device&&z.uuid().safeParse(device).success?device:null,p_purpose:`Exportação autorizada ${format.toUpperCase()}`});if(error)return NextResponse.json({error:error.code==="42501"?"Exportação restrita ou não habilitada.":"Falha na exportação.",code:error.code},{status:error.code==="42501"?403:422});rows=Array.isArray(data)?data as Record<string,unknown>[]:[];}else{let query=client.from(definition.table).select(definition.columns.join(",")).limit(1000);if(unitId)query=query.eq("unit_id",unitId);const{data,error}=await query;if(error)return NextResponse.json({error:"Falha na exportação.",code:error.code},{status:422});rows=(data??[]) as unknown as Record<string,unknown>[];}}
  const filename=`sgc-ubs-${resource}-${new Date().toISOString().slice(0,10)}`;
  if(format==="csv")return new NextResponse(toCsv(definition.columns,rows),{headers:{"content-type":"text/csv; charset=utf-8","content-disposition":`attachment; filename="${filename}.csv"`,"cache-control":"no-store"}});
  const workbook=new ExcelJS.Workbook();workbook.creator="SGC-UBS";workbook.created=new Date();const sheet=workbook.addWorksheet("Dados");sheet.columns=definition.columns.map((column)=>({header:column,key:column,width:Math.min(40,Math.max(14,column.length+2))}));for(const row of rows)sheet.addRow(Object.fromEntries(definition.columns.map((column)=>[column,safeSpreadsheetValue(row[column])])));sheet.getRow(1).font={bold:true};sheet.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,sheet.rowCount),column:definition.columns.length}};const buffer=await workbook.xlsx.writeBuffer();return new NextResponse(new Uint8Array(buffer),{headers:{"content-type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","content-disposition":`attachment; filename="${filename}.xlsx"`,"cache-control":"no-store"}});
}
