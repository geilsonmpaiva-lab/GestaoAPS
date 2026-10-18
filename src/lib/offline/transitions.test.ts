import {it,expect} from 'vitest';
import {criticalTransition,transitionSnapshot,validateTransition,type TransitionEnvelope} from './transitions';
import type {DetailData} from '@/lib/server/record-detail';
const id='00000000-0000-4000-8000-000000000001';
it.each(['knowledge-versions/transition','protocol-versions/submit-review','protocols/approve','protocols/publish','executions/complete','actions/complete','action-plans/effectiveness','meetings/start','meetings/complete','referrals/convert-to-action'])('matches fixed critical adapter %s',pair=>{const [resource,command]=pair.split('/');expect(criticalTransition(`/api/v1/${resource}/${id}/${command}`)).not.toBeNull();});
it.each([`https://evil.test/api/v1/actions/${id}/complete`,`/api/v1/actions/${id}/complete?extra=x`,`/api/v1/actions/${id}/delete`,`/api/v1/stock-batches/${id}/complete`])('denies unsupported destination %s',endpoint=>expect(criticalTransition(endpoint)).toBeNull());
it('sorts related snapshots and removes only the display-only timestamp',()=>{
 const detail={resource:'protocol-versions',record:{id,status:'EM_REVISAO',offline_saved_at:'local'},related:{forms:[{id:'b'},{id:'a'}],bindings:[],evidence:[{id:'file'}]}} as unknown as DetailData;
 expect(transitionSnapshot(detail)).toEqual({record:{id,status:'EM_REVISAO'},related:{forms:[{id:'a'},{id:'b'}],bindings:[]}});
});
it('does not accept an incomplete closing command or a resolution without a source',()=>{
 const input:TransitionEnvelope={organizationId:id,unitId:id,deviceId:id,entityId:id,resource:'meetings',command:'complete',operationId:id,expectedVersion:1,expectedRecord:{},expectedRelated:{},payload:{minutes:'short'}};
 expect(validateTransition(input)).toBe(false);input.payload.minutes='Ata sintética suficientemente extensa.';
 expect(validateTransition(input)).toBe(true);input.decision='RETRY';expect(validateTransition(input)).toBe(false);
 input.sourceOperationId=id;input.justification='Revisão sintética autorizada';expect(validateTransition(input)).toBe(true);
});
