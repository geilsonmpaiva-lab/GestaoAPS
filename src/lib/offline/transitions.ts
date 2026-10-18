import {z} from 'zod';
import type {DetailData,DetailRow} from '@/lib/server/record-detail';

const base={operationId:z.uuid(),expectedVersion:z.number().int().positive()};
const schemas={
 transition:z.object({...base,targetStatus:z.enum(['IN_REVIEW','APPROVED','PUBLISHED'])}),
 'submit-review':z.object(base),approve:z.object(base),publish:z.object(base),start:z.object(base),'convert-to-action':z.object(base),
 execution:z.object({...base,result:z.record(z.string(),z.unknown()).optional(),indicatorInputs:z.record(z.string(),z.number().finite()).optional(),compliance:z.string().max(80).optional(),notes:z.string().max(10000).optional()}),
 action:z.object({...base,evidenceAttachmentId:z.uuid().nullable().optional()}),
 effectiveness:z.object({...base,effective:z.boolean(),notes:z.string().trim().min(3).max(10000),evidenceAttachmentId:z.uuid().nullable().optional()}),
 meeting:z.object({...base,minutes:z.string().trim().min(10).max(50000)})
};
export function criticalTransition(endpoint:string){
 const match=endpoint.match(/^\/api\/v1\/(knowledge-versions|protocol-versions|protocols|executions|actions|action-plans|meetings|referrals)\/([0-9a-f-]{36})\/([a-z-]+)$/i);
 if(!match||!z.uuid().safeParse(match[2]).success)return null;
 const [,raw,entityId,command]=match;
 const resource=raw==='protocols'?'protocol-versions':raw;
 const allowed:Record<string,string[]>={'knowledge-versions':['transition'],'protocol-versions':['submit-review','approve','publish'],executions:['complete'],actions:['complete'],'action-plans':['effectiveness'],meetings:['start','complete'],referrals:['convert-to-action']};
 if(!allowed[resource]?.includes(command)||raw==='protocols'&&!['approve','publish'].includes(command))return null;
 const schema=command==='complete'?resource==='executions'?schemas.execution:resource==='actions'?schemas.action:schemas.meeting:schemas[command as keyof typeof schemas];
 return {resource,entityId,command,schema};
}
export const transitionEnvelope=z.object({organizationId:z.uuid(),unitId:z.uuid().nullable(),entityId:z.uuid(),operationId:z.uuid(),deviceId:z.uuid(),resource:z.string(),command:z.string(),expectedVersion:z.number().int().positive(),expectedRecord:z.record(z.string(),z.unknown()),expectedRelated:z.record(z.string(),z.array(z.record(z.string(),z.unknown())).max(100)),payload:z.record(z.string(),z.unknown()),decision:z.enum(['APPLY','KEEP_SERVER','RETRY']).optional(),sourceOperationId:z.uuid().optional(),justification:z.string().trim().min(10).max(1000).optional()});
export type TransitionEnvelope=z.infer<typeof transitionEnvelope>;
export function transitionSnapshot(detail:DetailData){
 const relatedKeys:Record<string,string[]>={'protocol-versions':['forms','bindings'],executions:['responses'],'action-plans':['actions'],meetings:['agenda','participants','referrals']};
 const {offline_saved_at:ignored,...record}=detail.record;void ignored;
 const related=Object.fromEntries((relatedKeys[detail.resource]??[]).map(key=>[key,[...(detail.related[key]??[])].sort((a,b)=>a.id.localeCompare(b.id))]));
 return {record:record as DetailRow,related};
}
export function validateTransition(envelope:TransitionEnvelope){
 const definition=criticalTransition(`/api/v1/${envelope.resource}/${envelope.entityId}/${envelope.command}`);
 if(!definition)return false;
 return definition.schema.safeParse({...envelope.payload,operationId:envelope.operationId,expectedVersion:envelope.expectedVersion}).success
  &&(envelope.decision===undefined||envelope.decision==='APPLY'?envelope.sourceOperationId===undefined:Boolean(envelope.sourceOperationId&&envelope.justification));
}
