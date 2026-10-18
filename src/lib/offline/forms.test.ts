import {it,expect} from 'vitest';
import {offlineForm,validateForm,formSnapshot} from './forms';
import type {TransitionEnvelope} from './transitions';
import type {DetailData} from '@/lib/server/record-detail';
const id='00000000-0000-4000-8000-000000000001';
it.each(['knowledge/versions','protocols/versions','protocol-versions/forms','protocol-versions/indicator-bindings','protocol-versions/executions','indicators/formulas','indicators/targets','executions/responses','measurements/analysis','measurements/open-plan','action-plans/actions','meetings/agenda','meetings/referrals'])('matches explicit offline form %s',pair=>{const [res,cmd]=pair.split('/');expect(offlineForm(`/api/v1/${res}/${id}/${cmd}`)).not.toBeNull();});
it('accepts PUT only for a specific authorized attendance destination',()=>{
 expect(offlineForm(`/api/v1/meetings/${id}/participants/${id}`,'PUT')?.userId).toBe(id);
 expect(offlineForm(`/api/v1/meetings/${id}/participants/${id}`,'POST')).toBeNull();
 expect(offlineForm(`/api/v1/meetings/${id}/agenda`,'PUT')).toBeNull();
});
it.each([`https://evil.test/api/v1/meetings/${id}/agenda`,`/api/v1/meetings/${id}/agenda?x=1`,`/api/v1/meetings/${id}/agenda/${id}`,`/api/v1/admin/${id}/users`,`/api/v1/meetings/${id}/delete`])('rejects destination %s',path=>expect(offlineForm(path)).toBeNull());
const envelope=(resource:string,command:string,payload:Record<string,unknown>):TransitionEnvelope=>({resource,command,payload,entityId:id,organizationId:id,unitId:id,operationId:id,deviceId:id,expectedVersion:1,expectedRecord:{},expectedRelated:{}});
it('validates target interval, units and zero without treating missing data as zero',()=>{
 const input={organizationId:id,unitId:id,startsOn:'2026-01-01',endsOn:'2026-12-31',comparison:'GTE'};
 expect(validateForm(envelope('indicators','targets',input))).toBe(false);
 expect(validateForm(envelope('indicators','targets',{...input,targetValue:0}))).toBe(true);
 expect(validateForm(envelope('indicators','targets',{...input,comparison:'BETWEEN',minimumValue:10,maximumValue:1}))).toBe(false);
});
it('rejects duplicate checklist identifiers, unknown fields and arbitrary formula code',()=>{
 const f={key:'value',label:'Valor',type:'number',required:true};
 expect(validateForm(envelope('protocol-versions','forms',{name:'Checklist',fields:[f,f]}))).toBe(false);
 expect(validateForm(envelope('meetings','agenda',{position:1,title:'Assunto',organizationId:id}))).toBe(false);
 expect(validateForm(envelope('indicators','formulas',{variables:['x'],expression:'eval(x)',validFrom:'2026-01-01'}))).toBe(false);
});
it('normalizes the shared version form without inventing protocol references',()=>{
 const parsed=offlineForm(`/api/v1/protocols/${id}/versions`)!.schema.parse({content:{text:'Synthetic'},references:[],validFrom:'2026-01-01'});
 expect(parsed).not.toHaveProperty('references');
});
it('compares historical versions and typed answers in prepared snapshots',()=>{
 const detail={resource:'executions',record:{id,version:1,offline_saved_at:'local'},related:{responses:[{id:'b',value:false},{id:'a',value:0}],forms:[{id:'f'}]},choices:{}} as unknown as DetailData;
 expect(formSnapshot(detail)).toEqual({record:{id,version:1},related:{responses:[{id:'a',value:0},{id:'b',value:false}],forms:[{id:'f'}]}});
});
it('requires an explicit reason and source for resolution',()=>{
 const input=envelope('meetings','participants',{userId:id,attended:false});expect(validateForm(input)).toBe(true);
 input.decision='RETRY';expect(validateForm(input)).toBe(false);input.sourceOperationId=id;input.justification='Revisão autorizada';expect(validateForm(input)).toBe(true);
});
