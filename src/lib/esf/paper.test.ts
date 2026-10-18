import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { buildMapPaper, buildProductionPaper, fitPaperCell, paperTemplates, paperValue } from './paper';
import { blankMap, mapIds, type EsfMap, type MapRow } from './maps';
import { esfReferenceItems } from './reference-items';
import type { EsfProductionData } from './production';
import { paperBackgrounds } from './paper-backgrounds';
import { paperBackground } from './paper-background';
const scope={organization:'[HOMOLOGAÇÃO] Organização',unit:'[HOMOLOGAÇÃO] UBS',team:'[HOMOLOGAÇÃO] Equipe'};
const row=(values:MapRow['values']):MapRow=>({id:randomUUID(),values});
const map=(id:string,rows:MapRow[]):EsfMap=>({id:randomUUID(),template_id:id,team_id:randomUUID(),version:1,revision:1,status:'OPEN',competency:'2028-01',payload:{...blankMap(id),sections:{[id==='insulinas'?'deliveries':'records']:rows}}});
// SHA-256 of the user's revised files. CI must not depend on their untracked folder.
const revisedHashes:Record<string,string>={
  producao:'11325bb3dd4132ce4980a50aba1f569e43d02f3feb02f89721b0ebf6a6315355',
  frequencia:'88f0887bbcf1ab7c42c27bdd39a30aa60dbb96db6478fa0f67b898679d7d2f94',
  hanseniase:'1dba5cc5299b09601b209ea37f8de0a9296da74eae34dae51fad4da313a6709a',
  tuberculose:'7a322f18d37f4584048acc76d879bc37d4a87be4c941ecd7e08b2305ebd0504a',
  'nascidos-vivos':'bb48b57fdf3d397b77ff2f339413fd35c32bcff59e29da36649288d2572d2e3a',
  obitos:'eaf86c04a113ce57c3bf1290f46444f133228800cfb6be508f8c6db24590960e',
  'testes-rapidos':'2b68d2db9e98a1a1fb9af434576bb83254a8275c96d824eb9eda3e5abfa06636',
  medicamentos:'1ba3ce59639952e66300cf136159caab51ed933b2b5a3be24f770662e08db3b0',
  materiais:'37bcf5ec0cc0f2911bf4c869822cfbf948ad8100375747ca0558c10461fdf52b',
  insulinas:'14280e22abb973ad3b30af594430d1717b1076f1068118cd53b433086131f46a',
};
describe('faithful SVG-backed ESF reports',()=>{
  it('uses byte-identical revised SVGs for all ten models',()=>{
    expect(Object.keys(paperTemplates)).toHaveLength(10);
    for(const [id,template] of Object.entries(paperTemplates)) {
      const source=readFileSync(`public${template.file}`);
      expect(createHash('sha256').update(source).digest('hex')).toBe(revisedHashes[id]);
      expect(source.toString()).not.toMatch(/<(script|foreignObject)\b|\son\w+\s*=/i);
      const cleaned=source.toString().replace(/<metadata\b[\s\S]*?<\/metadata>/g,'').match(/^\s*<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/)![1];
      expect(paperBackgrounds[id].body).toBe(cleaned);
      expect(paperBackgrounds[id].body).not.toMatch(/\s(?:href|style|on\w+)\s*=|<(?:script|foreignObject|image|use)\b/i);
    }
  });
  it('retains prescribed capacities and never drops overflow rows',()=>{
    for(const [id,capacity] of [['frequencia',20],['hanseniase',17],['tuberculose',8],['nascidos-vivos',24],['obitos',14],['insulinas',20]] as const) {
      const doc=buildMapPaper(map(id,Array.from({length:capacity+1},()=>row({name:'[SINTÉTICO] Nome'}))),scope);
      expect(doc.pages).toHaveLength(2);expect(doc.pages.reduce((n,p)=>n+p.occupied.length,0)).toBe(capacity+1);
    }
  });
  it('preserves all 51 records across three faithful frequency sheets',()=>{
    const doc=buildMapPaper(map('frequencia',Array.from({length:51},(_,i)=>row({professionalId:`[SINTÉTICO] P${i}`,registration:String(i)}))),scope);
    expect(doc.pages.map(p=>p.occupied.length)).toEqual([20,20,11]);expect(doc.pages.flatMap(p=>p.cells).filter(c=>c.label==='Servidor(a) sintético(a)')).toHaveLength(51);
  });
  it('keeps known medications on their exact printed row and calculates balances',()=>{
    const ref=esfReferenceItems.medicamentos[4];const doc=buildMapPaper(map('medicamentos',[row({itemId:ref.label,sourceLine:ref.line,previousBalance:100,pharmacyEntry:4,otherEntry:4,dispensed:4,transferred:4,losses:0,served:4,unserved:4})]),scope);
    expect(doc.pages).toHaveLength(1);expect(doc.pages[0].occupied).toEqual([4]);
    expect(doc.pages[0].cells.find(c=>c.label==='Saldo atual')?.value).toBe('100');
    expect(doc.pages[0].cells.find(c=>c.label==='Total de entradas')?.value).toBe('8');
    expect(doc.pages[0].cells.filter(c=>c.erase)).toHaveLength(0);
  });
  it('never prints an unknown item against a different preprinted drug name',()=>{
    const doc=buildMapPaper(map('medicamentos',[row({itemId:'[SINTÉTICO] Item extra',sourceLine:'1',entry:0})]),scope);
    expect(doc.pages).toHaveLength(2);expect(doc.pages[0].occupied).toEqual([]);expect(doc.pages[1].additional).toBe(true);
    expect(doc.pages[1].cells.some(c=>c.value==='[SINTÉTICO] Item extra'&&c.erase)).toBe(true);
    const background=paperBackground('medicamentos',true).body;
    expect(background).not.toContain(esfReferenceItems.medicamentos[0].label);expect(background).toContain('MOVIMENTO MENSAL DE ESTOQUE DE MEDICAMENTOS');expect((background.match(/<line /g)??[]).length).toBe((paperBackgrounds.medicamentos.body.match(/<line /g)??[]).length);
  });
  it('does not merge repeated lots into one balance or lose a supplied line reference',()=>{
    const ref=esfReferenceItems.medicamentos[0];const doc=buildMapPaper(map('medicamentos',[row({itemId:ref.label,sourceLine:ref.line,batchId:'Lote A'}),row({itemId:ref.label,sourceLine:ref.line,batchId:'Lote B'})]),scope);
    expect(doc.pages).toHaveLength(2);expect(doc.pages.map(p=>p.occupied)).toEqual([[0],[0]]);expect(doc.extras.map(e=>e.value)).toEqual(expect.arrayContaining(['Lote A','Lote B']));
  });
  it('uses the four extra material rows and preserves fields absent from the paper',()=>{
    const doc=buildMapPaper(map('materiais',[row({itemId:'[SINTÉTICO] Extra',sourceLine:'EXTRA',batchId:'Lote preservado',notes:'Observação integral'})]),scope);
    expect(doc.pages[0].occupied).toEqual([40]);expect(doc.extras.map(e=>e.value)).toEqual(expect.arrayContaining(['EXTRA','Lote preservado','Observação integral']));
  });
  it('preserves zero, NA, unknowns and adult dates without truncation',()=>{
    expect(paperValue(0)).toBe('0');expect(paperValue(null)).toBe('');expect(paperValue('Não se aplica')).toBe('NA');expect(paperValue('1950-01-01')).toBe('01/01/1950');
    expect(fitPaperCell({w:100,h:25,value:'x'.repeat(200)})).toBeNull();
    const doc=buildMapPaper(map('hanseniase',[row({name:'[SINTÉTICO] '+ 'Nome muito extenso '.repeat(30)})]),scope);
    expect(doc.extras.some(e=>e.value.includes('Nome muito extenso '.repeat(30).trim()))).toBe(true);
    expect(doc.pages[0].cells.find(c=>c.label==='Nome')?.lines?.[0]).toMatch(/^A\d+$/);
  });
  it('does not synthesize signatures from attached proof IDs or calculate doses',()=>{
    const receipt=randomUUID();const doc=buildMapPaper(map('insulinas',[row({patientName:'[SINTÉTICO] Pessoa',receiptId:receipt,nphUnits:12,regularUnits:4})]),scope);
    expect(doc.pages[0].cells.some(c=>c.value===receipt)).toBe(false);expect(doc.extras.some(e=>e.value===receipt)).toBe(true);
    expect(doc.pages[0].cells.some(c=>c.value==='12')).toBe(true);
  });
  it('fills the original lower insulin/supply grids without counting resupply as stock',()=>{
    const input=map('insulinas',[]);
    input.payload.sections.supplies=[row({item:'Agulhas',previousBalance:100,entry:4,exit:4,resupply:20})];
    input.payload.sections.insulinStock=[row({insulinType:'NPH',presentation:'Frasco',previousBalance:100,entry:4,exit:4,resupply:20})];
    const doc=buildMapPaper(input,scope);
    expect(doc.pages).toHaveLength(1);
    expect(doc.pages[0].cells.filter(c=>c.label==='Saldo atual').map(c=>c.value)).toEqual(['100','100']);
    expect(doc.pages[0].cells.filter(c=>c.value==='20')).toHaveLength(2);
    expect(doc.extras.find(e=>e.value==='NPH')?.label).not.toBe('insulinType');
  });
  it('projects all nine forms with cells contained in the source viewBox',()=>{
    for(const id of mapIds) { const doc=buildMapPaper(map(id,[row({name:'[SINTÉTICO] Nome',entry:0})]),scope);const t=paperTemplates[id];for(const page of doc.pages)for(const c of page.cells){expect(c.x).toBeGreaterThanOrEqual(0);expect(c.y).toBeGreaterThanOrEqual(0);expect(c.x+c.w).toBeLessThanOrEqual(t.width);expect(c.y+c.h).toBeLessThanOrEqual(t.height);} }
  });
  it('places twelve monthly values and the annual sum on the 25-line original production grid',()=>{
    const data={annual:[{competency:'2028-01',procedureId:'med-consulta',quantity:4},{competency:'2028-02',procedureId:'med-consulta',quantity:6}],monthly:null} as EsfProductionData;
    const doc=buildProductionPaper(data,'2028-01',scope);expect(doc.pages[0].cells.filter(c=>c.reference==='Consulta médica').map(c=>c.value)).toEqual(['4','6','10']);expect(doc.status).toBe('ANNUAL_PREVIEW');expect(doc.extras.some(e=>e.label==='Total anual parcial'&&e.value==='10')).toBe(true);
  });
});
