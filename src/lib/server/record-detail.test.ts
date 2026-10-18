import {describe,it,expect,vi,beforeEach} from 'vitest';
import type {WorkspaceContext} from './workspace';
const state=vi.hoisted(()=>({queries:[] as Array<{table:string;selects:string[];filters:unknown[][]}>,fail:false}));
vi.mock('server-only',()=>({}));
vi.mock('./workspace',()=>({loadModuleDefinitionV2:vi.fn()}));
vi.mock('./supabase',()=>({isDemoMode:()=>false,createSupabaseServerClient:async()=>({
 from:(table:string)=>{
  const entry={table,selects:[] as string[],filters:[] as unknown[][]};state.queries.push(entry);
  const data=table==='protocols'?[{id:'00000000-0000-4000-8000-000000000001',unit_id:'unit-a'}]:table==='knowledge_versions'?[{id:'version-a',knowledge_item_id:'parent-a',version_number:1,status:'PUBLISHED'}]:table==='knowledge_items'?[{id:'parent-a',title:'Referência autorizada'}]:[];
  const result=()=>({data,error:state.fail&&table==='knowledge_items'?{message:'erro interno'}:null});
  const q={select:(columns:string)=>{entry.selects.push(columns);return q;},eq:(...args:unknown[])=>{entry.filters.push(['eq',...args]);return q;},or:(...args:unknown[])=>{entry.filters.push(['or',...args]);return q;},is:(...args:unknown[])=>{entry.filters.push(['is',...args]);return q;},in:(...args:unknown[])=>{entry.filters.push(['in',...args]);return q;},limit:()=>q,maybeSingle:async()=>({data:data[0],error:null}),then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(result()).then(resolve)};
  return q;
 },rpc:async()=>({data:[],error:null}),
})}));
import {loadRecordDetail} from './record-detail';
const workspace={organizationId:'org-a',unitId:'unit-a',enabledModules:['protocolos']} as WorkspaceContext;
beforeEach(()=>{state.queries=[];state.fail=false;});
describe('referências legíveis do detalhe',()=>{
 it('consulta apenas colunas existentes com escopo e soft delete preservados',async()=>{
  const detail=await loadRecordDetail('protocols','00000000-0000-4000-8000-000000000001',workspace);
  expect(detail?.choices.knowledge[0].reference_title).toBe('Referência autorizada');
  const parent=state.queries.find(q=>q.table==='knowledge_items')!;
  expect(parent.selects).toEqual(['*','id,title']);
  expect(parent.filters).toContainEqual(['eq','organization_id','org-a']);
  expect(parent.filters).toContainEqual(['or','unit_id.is.null,unit_id.eq.unit-a']);
  expect(parent.filters).toContainEqual(['is','deleted_at',null]);
  expect(parent.filters).toContainEqual(['in','id',['parent-a']]);
 });
 it('não mascara erro da consulta como ausência de referências',async()=>{
  state.fail=true;
  await expect(loadRecordDetail('protocols','00000000-0000-4000-8000-000000000001',workspace)).rejects.toThrow('Não foi possível identificar as referências autorizadas.');
 });
});
