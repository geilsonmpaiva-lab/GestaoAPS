import {z} from 'zod';
import {parseFormula} from '@/lib/domain/formula';
import type {DetailData} from '@/lib/server/record-detail';
import {transitionEnvelope,type TransitionEnvelope} from './transitions';

const text=(max=10000)=>z.string().trim().min(3).max(max);
const date=z.iso.date(),instant=z.iso.datetime({offset:true}).nullable().optional();
const id=z.uuid(),optionalId=id.nullable().optional();
const versionFields={content:z.record(z.string(),z.unknown()).refine(v=>Object.keys(v).length>0),validFrom:date,validUntil:date.nullable().optional()};
const schemas={
 'knowledge/versions':z.object({...versionFields,references:z.array(z.record(z.string(),z.unknown())).max(100).default([])}).strict(),
 'protocols/versions':z.object({...versionFields,references:z.array(z.unknown()).max(0).optional()}).strict().transform(({references,...value})=>{void references;return value;}),
 'protocol-versions/forms':z.object({name:text(240),fields:z.array(z.object({key:z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),label:z.string().trim().min(2).max(500),type:z.enum(['text','number','boolean']),required:z.boolean()}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.fields.map(f=>f.key)).size===v.fields.length),
 'protocol-versions/indicator-bindings':z.object({indicatorId:id,formulaVersionId:id,unitId:id.nullable()}).strict(),
 'protocol-versions/executions':z.object({executionId:id,unitId:id}).strict(),
 'indicators/formulas':z.object({variables:z.array(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/)).min(1).max(64).refine(v=>new Set(v).size===v.length),expression:z.unknown().refine(value=>{try{parseFormula(value);return true;}catch{return false;}}),validFrom:date}).strict(),
 'indicators/targets':z.object({organizationId:id,unitId:id,startsOn:date,endsOn:date,comparison:z.enum(['GTE','LTE','EQ','BETWEEN']),targetValue:z.number().finite().nullable().optional(),minimumValue:z.number().finite().nullable().optional(),maximumValue:z.number().finite().nullable().optional(),attentionRule:z.record(z.string(),z.number().finite()).nullable().optional()}).strict().refine(v=>v.endsOn>=v.startsOn&&(v.comparison==='BETWEEN'?v.minimumValue!=null&&v.maximumValue!=null&&v.minimumValue<=v.maximumValue:v.targetValue!=null)),
 'executions/responses':z.object({responses:z.array(z.object({fieldKey:z.string().min(1).max(64),value:z.union([z.string().max(10000),z.number().finite(),z.boolean(),z.null()]),compliant:z.boolean().nullable().optional(),observation:z.string().max(4000).optional()}).strict()).min(1).max(100)}).strict().refine(v=>new Set(v.responses.map(r=>r.fieldKey)).size===v.responses.length),
 'measurements/analysis':z.object({analysis:text(),cause:z.string().trim().max(10000).optional(),decision:text(),actionPlanId:optionalId}).strict(),
 'measurements/open-plan':z.object({title:text(200),description:text(),classification:z.enum(['MINOR','MAJOR','CRITICAL']).default('MAJOR'),responsibleId:optionalId,dueAt:instant}).strict(),
 'action-plans/actions':z.object({what:text(500),why:z.string().trim().max(2000).optional(),where:z.string().trim().max(240).optional(),whenAt:instant,whoId:optionalId,how:z.string().trim().max(4000).optional(),howMuch:z.number().finite().nonnegative().nullable().optional()}).strict(),
 'meetings/agenda':z.object({position:z.number().int().min(1).max(999),title:text(240),description:z.string().trim().max(4000).optional()}).strict(),
 'meetings/participants':z.object({userId:id,attended:z.boolean().nullable()}).strict(),
 'meetings/referrals':z.object({agendaItemId:optionalId,description:text(4000),responsibleId:optionalId,dueAt:instant,priority:z.enum(['LOW','NORMAL','HIGH','CRITICAL']).default('NORMAL')}).strict()
};

export function offlineForm(endpoint:string,method='POST'){
 const match=endpoint.match(/^\/api\/v1\/(knowledge|protocols|protocol-versions|indicators|executions|measurements|action-plans|meetings)\/([0-9a-f-]{36})\/([a-z-]+)(?:\/([0-9a-f-]{36}))?$/);
 if(!match||!id.safeParse(match[2]).success)return null;
 const [,resource,entityId,command,userId]=match;
 if(command==='participants'?(method!=='PUT'||!id.safeParse(userId).success):(method!=='POST'||userId!==undefined))return null;
 const schema=schemas[`${resource}/${command}` as keyof typeof schemas];
 return schema?{resource,entityId,command,userId,schema}:null;
}
export function formDefinition(envelope:TransitionEnvelope){
 const attendance=envelope.resource==='meetings'&&envelope.command==='participants';
 return offlineForm(`/api/v1/${envelope.resource}/${envelope.entityId}/${envelope.command}${attendance?`/${envelope.payload.userId}`:''}`,attendance?'PUT':'POST');
}
export function validateForm(envelope:TransitionEnvelope){
 const definition=formDefinition(envelope);
 return Boolean(definition?.schema.safeParse(envelope.payload).success&&(envelope.decision===undefined||envelope.decision==='APPLY'?envelope.sourceOperationId===undefined:envelope.sourceOperationId&&envelope.justification));
}
export {transitionEnvelope as formEnvelope};
export function formSnapshot(detail:DetailData){
 const keys:Record<string,string[]>={knowledge:['knowledge-versions'],protocols:['protocol-versions'],'protocol-versions':['forms','bindings'],indicators:['formulas','targets'],executions:['responses','forms'],'action-plans':['actions'],measurements:['analyses','nonconformities'],meetings:['agenda','participants','referrals']};
 const {offline_saved_at:ignored,...record}=detail.record;void ignored;
 return {record,related:Object.fromEntries((keys[detail.resource]??[]).map(key=>[key,[...(detail.related[key]??[])].sort((a,b)=>a.id.localeCompare(b.id))]))};
}
