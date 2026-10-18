import { paperBackgrounds } from './paper-backgrounds';
/** Only static template literals are transformed. User values never enter SVG markup. */
export function paperBackground(form:string,additional=false) {
  const original=paperBackgrounds[form];
  if(!original)throw new Error('Modelo não disponível.');
  const ranges:Record<string,[number,number,number,number]>={medicamentos:[111.3,583.4,323,1050],materiais:[90,669,497,2191],'testes-rapidos':[150,686.4,593,935]};
  const range=additional?ranges[form]:undefined;
  if(!range)return original;
  const [left,right,top,bottom]=range;
  const body=original.body.replace(/<text\b([^>]*)>[\s\S]*?<\/text>/g,(element,attributes:string)=>{
    const x=Number(attributes.match(/\bx="([\d.]+)"/)?.[1]),y=Number(attributes.match(/\by="([\d.]+)"/)?.[1]);
    return x>=left&&x<right&&y>=top&&y<=bottom?'':element;
  });
  return {...original,body};
}
