import {describe,it,expect} from 'vitest';
import {displayDate,recordTitle,relationLabel} from './record-presentation';
import {safeReturnTo,recordHref} from './ui-labels';

describe('apresentação dos detalhes',()=>{
 it('mantém datas de calendário e apresenta instantes em Brasília',()=>{
  expect(displayDate('2026-10-01')).toBe('01/10/2026');
  expect(displayDate('2026-10-01T01:00:00Z',true)).toBe('30/09/2026, 22:00 (Brasília)');
  expect(displayDate('inválida',true)).toBe('Data não informada');
 });
 it('identifica registros sem títulos e distingue versões sem pai visível',()=>{
  expect(recordTitle({id:'abcdef01-1111'},'executions')).toBe('Execução de protocolo · abcdef01');
  expect(recordTitle({id:'abcdef01',version_number:1,reference_title:'Manual administrativo'},'knowledge-versions')).toBe('Manual administrativo · versão 1');
  expect(recordTitle({id:'abcdef01',version_number:1},'knowledge-versions')).toBe('Conhecimento · versão 1 · abcdef01');
  expect(recordTitle({id:'a',competency:'2026-10-01'},'measurements')).toBe('Medição de 01/10/2026');
  expect(recordTitle({comment:'Acompanhamento confirmado'},'comments')).toBe('Acompanhamento confirmado');
  expect(relationLabel.comments).toBe('Comentários');
 });
 it('retorna à lista original sem perder filtros nem paginação',()=>{
  let path='/conhecimento?search=gest%C3%A3o&page=3&status=PUBLISHED';
  for(let i=0;i<50;i++) path=recordHref('knowledge','id-'+i,path);
  expect(path.length).toBeLessThan(160);
  expect(new URL(path,'https://sgc.invalid').searchParams.get('returnTo')).toBe('/conhecimento?search=gest%C3%A3o&page=3&status=PUBLISHED');
  expect(safeReturnTo('/conhecimento?search=a&view=outside&page=3&returnTo=%2F')).toBe('/conhecimento?search=a&view=outside&page=3');
  expect(safeReturnTo('//example.com')).toBe('/');
  expect(safeReturnTo('/\\example.com')).toBe('/');
  expect(safeReturnTo('https://example.com')).toBe('/');
  expect(safeReturnTo('/'+ 'a'.repeat(17000))).toBe('/');
 });
});
