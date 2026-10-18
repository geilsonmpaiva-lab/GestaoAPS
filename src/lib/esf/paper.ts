import { calculatedRow, mapDefinition, type EsfMap, type MapValue } from './maps';
import { annualProductionRows, type EsfProductionData } from './production';
import { esfReferenceItems } from './reference-items';

export type PaperScope = { organization: string; unit: string; team: string };
export type PaperCell = { x: number; y: number; w: number; h: number; value: string; label: string; reference: string; erase?: boolean; lines?: string[]; font?: number };
export type PaperExtra = { reference: string; label: string; value: string };
export type PaperPage = { cells: PaperCell[]; additional: boolean; occupied: number[] };
export type PaperDocument = { form: string; pages: PaperPage[]; extras: PaperExtra[]; scope: PaperScope; competency: string; version: number; status: string };
const files = ['01_producao_consolidada','02_frequencia_servidores','03_hanseniase_acompanhamento','04_tuberculose_acompanhamento','05_nascidos_vivos','06_obitos_anotacoes','07_teste_rapido_mensal','08_estoque_medicamentos','09_material_medico_hospitalar','10_insulinas_insumos_diabetes'];
const ids = ['producao','frequencia','hanseniase','tuberculose','nascidos-vivos','obitos','testes-rapidos','medicamentos','materiais','insulinas'];
const heights = [1161,1193,1056,1197,1125,1015,1076,1207,2341,1040];
export const paperTemplates = Object.fromEntries(ids.map((id, i) => [id, { file: `/esf/revisados/${files[i]}_revisado.svg`, width: 1600, height: heights[i], portrait: id === 'materiais', serif: ['testes-rapidos','medicamentos'].includes(id) }]));
const normalize = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function paperValue(value: MapValue | undefined) {
  if (value === null || value === undefined || value === '') return '';
  if (value === 'Não se aplica') return 'NA';
  if (value === 'Não informado') return 'NI';
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8)}/${value.slice(5,7)}/${value.slice(0,4)}` : value;
}
/** Conservative metrics: never squeeze/truncate a value to make it appear complete. */
export function fitPaperCell(cell: Pick<PaperCell,'w'|'h'|'value'>,font=12): string[] | null {
  const max = Math.max(1, Math.floor((cell.w - 6) / (font*.54)));
  const maxLines = Math.max(1, Math.floor((cell.h - 2) / (font*1.1)));
  const words = (/^\d{2}\/\d{2}\/\d{4}$/.test(cell.value) && max < 10 ? [cell.value.slice(0,6), cell.value.slice(6)] : cell.value.split(/\s+/));
  const lines: string[] = []; let line = '';
  for (const word of words) {
    if (word.length > max) return null;
    if (line && line.length + word.length + 1 > max) { lines.push(line); line = word; } else line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  return lines.length <= maxLines ? lines : null;
}
const rowY = (top: number, bottom: number, count: number) => Array.from({ length: count + 1 }, (_, i) => top + (bottom - top) * i / count);
const grids: Record<string,{ xs: number[]; ys: number[]; keys: string[] }> = {
  frequencia: { xs:[106.1,241.4,670.3,887.5,1103.4,1154.8,1205.7,1255.4,1290.9,1325.6,1362.4,1397.4,1435,1468.4,1506,1545.3,1570], ys:rowY(400,971,20), keys:['registration','professionalId','position','function','secondment','hours','level','status0','status1','status2','status3','morning','afternoon','night','absences','notes'] },
  hanseniase: { xs:[77.3,136.9,211.3,554.6,680.2,782.1,899.4,1020.5,1158.2,1286.1,1387.2,1497], ys:rowY(312,882,17), keys:['notificationNumber','notificationDate','name','residenceCity','lastAttendance','examinedContacts','classification','disability','assessmentDate','dischargeType','dischargeDate'] },
  tuberculose: { xs:[67.8,174,396.7,447.9,499.6,550.4,602.1,652.9,703.3,780.2,881.4,957,1046.7,1097.5,1162.4,1239.3,1330.6,1396.7,1461.6,1522.7], ys:rowY(441,782,8), keys:['notificationDate','name','smear1','smear2','smear3','smear4','smear5','smear6','treatmentChangedOn','examinedContacts','status9','status12','closureStatus','closedOn','sputumCulture','otherCulture','hiv','histopathology','observedTreatment'] },
  'nascidos-vivos': { xs:[103.7,176.6,522.9,712.3,809.6,873.5,938.7,1031.7,1089.1,1150,1237.8,1508.3], ys:rowY(475,990,24), keys:['familyNumber','motherName','address','residenceCity','sex','weightWithUnit','birthDate','hospital','home','occurrenceCity','agentId'] },
  obitos: { xs:[76.8,215.9,322.3,430.4,737.4,957.7,1133.9,1318.9,1475.1], ys:rowY(352,910,14), keys:['birthOrAge','deathDate','declarationNumber','name','address','place','city','agentId'] },
  'testes-rapidos': { xs:[150,686.4,795.4,892,997.8,1090.3,1193.1,1292.8,1401.7,1525], ys:[593,637,680,715,750,787,820,857,893,935], keys:['itemId','previousBalance','entry','pregnancyUse','otherUse','losses','currentBalance','resupply','reactive'] },
  medicamentos: { xs:[111.3,152.8,583.4,657.5,728.5,787.2,845.8,905.7,959.7,1013.6,1087.2,1149.7,1222.5,1234.5,1292.2,1345.7,1410.4,1493], ys:rowY(323,1050,30), keys:['sourceLine','itemId','previousBalance','pharmacyEntry','otherEntry','entryTotal','dispensed','transferred','losses','exitTotal','currentBalance','expiresOn','gap','served','unserved','totalDemand','authorized'] },
  materiais: { xs:[90,144,669,815,959,1092,1232,1363,1506], ys:rowY(497,2191,44), keys:['sourceLine','itemId','previousBalance','entry','exit','currentBalance','unserved','authorized'] },
  insulinas: { xs:[8,43,465,513,733,797,877,942,1010,1092,1162,1232,1378,1540], ys:rowY(272,822,20), keys:['number','patientName','birthDate','address','diabetesType','nphUnits','nphVialsDelivered','nphPensDelivered','regularUnits','regularVialsDelivered','regularPensDelivered','deliveredOn','signature'] },
};
type Header = [string,number,number,number,number];
const headers: Record<string,Header[]> = {
  frequencia:[['unit',938,166,457,25],['administrativeAddress',803,198,590,24],['competency',1410,82,154,48],['informationDate',112,1000,205,42],['informationOwner',335,1035,382,58],['unitSecretary',735,1030,355,62],['planningSecretary',1105,1030,354,62],['planningDate',1470,1030,94,64]],
  hanseniase:[['team',200,201,378,25],['competency',706,201,223,25],['reportDate',1113,198,280,25],['technicalOwner',234,887,705,26]],
  tuberculose:[['team',134,241,488,25],['competency',787,245,240,25],['reportDate',1178,245,236,25],['filledBy',428,287,1070,26]],
  'nascidos-vivos':[['team',175,285,338,27],['month',175,315,338,24],['year',707,320,138,24],['segment',707,292,138,24],['unit',930,292,207,24],['area',1230,287,240,24]],
  obitos:[['team',163,247,393,26],['competency',678,246,237,26],['reportDate',1075,242,303,26]],
  'testes-rapidos':[['unit',578,394,409,25],['sisloglab',1110,416,400,25],['month',252,440,59,24],['year',340,440,84,24],['technicalOwner',803,436,269,24],['contact',1218,432,260,24],['serviceOther',1022,342,114,23]],
  medicamentos:[['unit',335,199,231,24],['month',260,244,62,24],['year',335,244,94,24],['analyzedOn',980,239,174,22],['checkedOn',980,261,174,22],['managerId',326,1096,201,27],['pharmacistId',1325,1087,190,23]],
  materiais:[['team',237,365,566,28],['responsible',325,407,486,28],['reportDate',1230,424,266,27],['reviewerId',161,2286,769,27],['analyzedOn',1135,2255,368,27]],
  insulinas:[['team',243,151,330,28],['competency',705,145,190,28],['unitOwner',245,994,330,24],['cafOwner',843,1008,154,23]],
};

function finish(doc: PaperDocument) {
  for (const [p, page] of doc.pages.entries()) for (const cell of page.cells) {
    const fit = [12,11,10].map(font=>({font,lines:fitPaperCell(cell,font)})).find(f=>f.lines);
    if (fit) { cell.lines = fit.lines!;cell.font=fit.font; }
    else {
      const marker = `A${doc.extras.length + 1}`;
      doc.extras.push({ reference:`${marker} - folha ${p+1}, ${cell.reference}`,label:cell.label,value:cell.value });
      cell.lines = [cell.w<35?'*':marker];cell.font=10;
    }
  }
  return doc;
}
function put(page: PaperPage, key: string, value: MapValue | undefined, rect: number[], reference: string, label=key, erase=false) {
  const text = paperValue(value); if (!text && !erase) return;
  const [x,y,w,h] = rect; page.cells.push({x,y,w,h,value:text,label,reference,erase});
}

/** Uses measured SVG coordinates; extra fields/long values are preserved in a labelled annex. */
export function buildMapPaper(map: EsfMap, scope: PaperScope): PaperDocument {
  const def = mapDefinition(map.template_id)!; if (!def) throw new Error('Modelo não disponível.');
  const grid = grids[map.template_id];
  const doc: PaperDocument = { form:map.template_id,pages:[],extras:[],scope,competency:map.competency,version:map.version,status:map.status };
  const context: Record<string,MapValue> = {...map.payload.headers,team:scope.team,unit:scope.unit,competency:map.competency,month:map.competency.slice(5),year:map.competency.slice(0,4)};
  function newPage(additional=false) {
    const page: PaperPage = { cells:[],additional,occupied:[] }; doc.pages.push(page);
    for (const [key,x,y,w,h] of headers[map.template_id] ?? []) put(page,key,context[key],[x,y,w,h],'Cabeçalho',def.headers.find(f=>f.key===key)?.label ?? key);
    // The template has a preprinted AB checkbox; remove its X rather than falsely asserting a service type.
    if (map.template_id==='testes-rapidos') {
      const service=normalize(map.payload.headers.serviceType);
      for (const [label,x] of [['atencao basica',440],['maternidade',620],['sae',805],['outro',928]] as const) put(page,'serviceType',service===label?'(X)':'( )',[x,347,48,25],'Cabeçalho','Tipo do serviço',true);
    }
    if (additional && ['medicamentos','materiais','testes-rapidos'].includes(map.template_id)) {
      for(let i=0;i<grid.ys.length-1;i++) {
        const item=grid.keys.indexOf('itemId'); put(page,'itemId','',[grid.xs[item]+1,grid.ys[i]+1,grid.xs[item+1]-grid.xs[item]-2,grid.ys[i+1]-grid.ys[i]-2],'','',true);
      }
    }
    return page;
  }
  newPage();
  const records=map.payload.sections[map.template_id==='insulinas'?'deliveries':'records'] ?? [];
  records.forEach((row,index)=> {
    let page: PaperPage | undefined, slot: number;
    const refs=esfReferenceItems[map.template_id];
    const known=refs?.findIndex(ref=> normalize(ref.label)===normalize(row.values.itemId) && (!row.values.sourceLine || String(row.values.sourceLine)===ref.line)) ?? -1;
    if (refs && known>=0) { slot=known; page=doc.pages.find(p=>!p.additional&&!p.occupied.includes(slot)); if(!page) page=newPage(); }
    else if (refs) {
      const freeStart=map.template_id==='materiais'?40:map.template_id==='testes-rapidos'?5:grid.ys.length-1;
      page=doc.pages.find(p=>!p.additional&&Array.from({length:grid.ys.length-1-freeStart},(_,i)=>i+freeStart).some(i=>!p.occupied.includes(i)));
      if(page) slot=Array.from({length:grid.ys.length-1-freeStart},(_,i)=>i+freeStart).find(i=>!page!.occupied.includes(i))!;
      else { page=doc.pages.find(p=>p.additional&&p.occupied.length<grid.ys.length-1) ?? newPage(true); slot=page.occupied.length; }
    } else { page=doc.pages.find(p=>p.occupied.length<grid.ys.length-1) ?? newPage(); slot=page.occupied.length; }
    page.occupied.push(slot);
    const values: Record<string,MapValue> = calculatedRow(map.template_id,map.template_id==='insulinas'?'deliveries':'records',row.values);
    const used=new Set<string>(); const rowRef=`Registro ${index+1} (${row.id.slice(0,8)})`;
    if(map.template_id==='frequencia') {
      ['efetivo','est prob','temp','car com'].forEach((status,i)=>values[`status${i}`]=normalize(values.employmentStatus)===status?'X':'');
      ['manha','tarde','noite'].forEach((shift,i)=>values[['morning','afternoon','night'][i]]=normalize(values.shift).split(' ').includes(shift)?'X':'');
      // Original text remains in annex, including unknown/unapproved classifications.
    }
    if(map.template_id==='nascidos-vivos') {
      values.weightWithUnit=values.weight===null||values.weight===undefined?'':`${paperValue(values.weight)} ${paperValue(values.weightUnit) || '(unidade NI)'}`;
      values.hospital=normalize(values.birthPlace)==='hospitalar'||normalize(values.birthPlace)==='hospital'?'X':'';
      values.home=normalize(values.birthPlace)==='domiciliar'||normalize(values.birthPlace)==='domicilio'?'X':''; used.add('weight');used.add('weightUnit');
    }
    if(map.template_id==='obitos') { values.birthOrAge=values.birthDate && values.birthDate!=='Não se aplica'?paperValue(values.birthDate):typeof values.age==='number'?`${values.age} ${values.ageUnit ?? '(unidade NI)'}`:paperValue(values.birthDate); used.add('birthDate');used.add('age');used.add('ageUnit'); }
    for(const [col,key] of grid.keys.entries()) {
      if(['gap','signature','number'].includes(key)) continue;
      const isItem=key==='itemId'; const sourceNumber=key==='sourceLine';
      if((isItem||sourceNumber)&&refs&&known>=0) {used.add(key);continue;}
      if(sourceNumber&&refs&&!page.additional) continue;
      const erase=isItem&&!!refs || sourceNumber&&page.additional;
      const value=sourceNumber&&page.additional?String(index+1):values[key];
      if(sourceNumber&&page.additional&&paperValue(values[key])!==String(value))doc.extras.push({reference:rowRef,label:'Linha informada no lançamento',value:paperValue(values[key])});
      put(page,key,value,[grid.xs[col]+1,grid.ys[slot]+1,grid.xs[col+1]-grid.xs[col]-2,grid.ys[slot+1]-grid.ys[slot]-2],rowRef,def.sections[0].fields.find(f=>f.key===key)?.label ?? key,erase); used.add(key);
    }
    for(const f of def.sections[0].fields) if(!used.has(f.key)&&paperValue(values[f.key])) doc.extras.push({reference:rowRef,label:f.label,value:paperValue(values[f.key])});
  });
  const usedHeaders = new Set((headers[map.template_id]??[]).map(h=>h[0]));
  for(const f of def.headers) if(!usedHeaders.has(f.key)&&paperValue(map.payload.headers[f.key])) doc.extras.push({reference:'Cabeçalho',label:f.label,value:paperValue(map.payload.headers[f.key])});
  if(map.template_id==='insulinas') insulinTables(doc,map,newPage);
  return finish(doc);
}

function insulinTables(doc:PaperDocument,map:EsfMap,newPage:()=>PaperPage) {
  const label=(section:string,key:string)=>mapDefinition('insulinas')!.sections.find(s=>s.id===section)?.fields.find(f=>f.key===key)?.label??key;
  const supplyNames=[['agulhas p canetas','agulhas para canetas','agulhas'],['lancetas estereis','lancetas'],['seringas 1 ml ag','seringas 1 ml','seringas'],['tiras reativas','tiras']];
  const ys=[880,903,927,951,975], xs=[280,393,510,610,707,820]; const occupied=new Map<PaperPage,Set<string>>();
  const choose=(key:string)=>{let p=doc.pages.find(p=>!occupied.get(p)?.has(key));if(!p)p=newPage();if(!occupied.has(p))occupied.set(p,new Set());occupied.get(p)!.add(key);return p;};
  for(const [index,row] of (map.payload.sections.supplies??[]).entries()) {
    const slot=supplyNames.findIndex(names=>names.includes(normalize(row.values.item))); const values=calculatedRow('insulinas','supplies',row.values);
    if(slot<0) { for(const [key,v] of Object.entries(values)) if(paperValue(v))doc.extras.push({reference:`Insumo ${index+1}`,label:label('supplies',key),value:paperValue(v)}); continue; }
    const page=choose(`supply${slot}`);
    ['previousBalance','entry','exit','currentBalance','resupply'].forEach((key,i)=>put(page,key,values[key],[xs[i]+1,ys[slot]+1,xs[i+1]-xs[i]-2,ys[slot+1]-ys[slot]-2],`Insumo ${index+1}`,label('supplies',key)));
  }
  for(const [index,row] of (map.payload.sections.insulinStock??[]).entries()) {
    const type=normalize(row.values.insulinType), presentation=normalize(row.values.presentation); const t=type==='nph'?0:type==='regular'?1:-1, p=['frasco','frascos'].includes(presentation)?0:['caneta','canetas'].includes(presentation)?1:-1;
    const values=calculatedRow('insulinas','insulinStock',row.values);
    if(t>=0&&p>=0) { const slot=t*2+p;const page=choose(`stock${slot}`); const stock=[833,925,1020,1118,1215],resupply=[1215,1305,1393,1485,1580];
      put(page,'currentBalance',values.currentBalance,[stock[slot]+1,956,stock[slot+1]-stock[slot]-2,21],`Estoque ${index+1}`,'Saldo atual');
      put(page,'resupply',values.resupply,[resupply[slot]+1,971,resupply[slot+1]-resupply[slot]-2,28],`Estoque ${index+1}`,'Ressuprimento');
    }
    for(const [key,v] of Object.entries(values)) if(paperValue(v))doc.extras.push({reference:`Estoque ${index+1}`,label:label('insulinStock',key),value:paperValue(v)});
  }
}

export function buildProductionPaper(data:EsfProductionData,month:string,scope:PaperScope):PaperDocument {
  const page:PaperPage={cells:[],additional:false,occupied:[]};
  const doc:PaperDocument={form:'producao',pages:[page],extras:[],scope,competency:month,version:data.monthly?.version??0,status:'ANNUAL_PREVIEW'};
  put(page,'team',scope.team,[266,218,612,28],'Cabeçalho','ESF');put(page,'month',month.slice(5),[270,273,233,26],'Cabeçalho','Mês');put(page,'year',month.slice(0,4),[555,276,90,26],'Cabeçalho','Ano');
  const xs=[609.5,670.9,734.5,800,859.4,922.5,987.3,1049.2,1111,1175,1250.3,1312.6,1388.3,1488.9]; const ys=rowY(372,1083,25);
  const annual=annualProductionRows(data.annual,month.slice(0,4));
  if(data.monthly?.status==='CLOSED'&&data.monthly.snapshot) for(const row of annual) {const snapshot=data.monthly.snapshot.find(s=>s.procedureId===row.id); row.months[Number(month.slice(5))-1]=snapshot?.quantity??null; const known=row.months.filter((v):v is number=>v!==null);row.total=known.length?known.reduce((a,b)=>a+b,0):null;row.partial=known.length<12;}
  annual.forEach((row,i)=> { [...row.months,row.total].forEach((v,col)=>put(page,`month${col}`,v,[xs[col]+1,ys[i]+1,xs[col+1]-xs[col]-2,ys[i+1]-ys[i]-2],row.label,col===12?'TOTAL':'Mês')); if(row.partial&&row.total!==null)doc.extras.push({reference:row.label,label:'Total anual parcial',value:String(row.total)}); });
  doc.extras.push({reference:'Consolidação anual',label:'Situação',value:'Total parcial quando existem meses sem lançamento; branco/NI não equivale a zero. O snapshot fechado substitui somente a competência selecionada.'});
  return finish(doc);
}
