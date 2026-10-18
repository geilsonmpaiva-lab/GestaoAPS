import { paperTemplates, type PaperDocument } from '@/lib/esf/paper';
import { paperBackground } from '@/lib/esf/paper-background';

/** Original vector geometry is retained; React escapes every overlaid value. */
export function EsfPaperReport({ document }: { document: PaperDocument }) {
  const unique=`paper-${document.form}-${document.version}`;
  const template=paperTemplates[document.form],background=paperBackground(document.form);
  const closed=document.status==='CLOSED';
  return <div className="esf-faithful-report">
    <div className="esf-paper-screen-note"><h2>Formulário revisado preenchido</h2><p>Grade, rótulos e proporções preservados do SVG. As marcas oficiais permanecem nas áreas reservadas existentes no arquivo. Células em branco/NI não equivalem a zero; NA = não se aplica. Valores longos e campos extras aparecem no anexo, sem descarte.</p></div>
    {document.pages.map((page,p)=><section key={p} className={`esf-paper-sheet ${template.portrait?'esf-paper-portrait':'esf-paper-landscape'}`} aria-label={`Formulário fiel - folha ${p+1}`}>
      <div className="esf-paper-strip"><strong>HOMOLOGAÇÃO - DADOS SINTÉTICOS</strong><span>{document.competency} · v{document.version} · {closed?'SNAPSHOT DE TESTE':'PRÉVIA NÃO DEFINITIVA'} · Folha {p+1}/{document.pages.length}{page.additional?' · ITENS ADICIONAIS':''}</span></div>
      <svg className="esf-source-canvas" data-source-svg={template.file} fontFamily={background.font} viewBox={`0 0 ${template.width} ${template.height}`} role="img" aria-label={`Modelo revisado ${document.form}, preenchido; folha ${p+1}`} preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        <title>{`Modelo revisado preenchido: ${document.form}`}</title>
        {/* Build-time allowlisted SVG only. Never interpolate payload/user content here. */}
        <g className="esf-source-background" dangerouslySetInnerHTML={{__html:paperBackground(document.form,page.additional).body}} />
        <g fontFamily={template.serif?'Times New Roman, Times, serif':'Arial, Helvetica, sans-serif'} fill="#000">
          {page.cells.map((cell,c)=> {
            const id=`${unique}-${p}-${c}`; const font=cell.font??12; const lineHeight=font*1.1; const lines=cell.lines??[];
            const top=cell.y+Math.max(1,(cell.h-lines.length*lineHeight)/2);
            return <g key={c} data-paper-cell={`${cell.reference}:${cell.label}`}><title>{`${cell.label}: ${cell.value}`}</title><defs><clipPath id={id}><rect x={cell.x} y={cell.y} width={cell.w} height={cell.h}/></clipPath></defs>
              {cell.erase&&<rect x={cell.x} y={cell.y} width={cell.w} height={cell.h} fill="#fff"/>}
              <text clipPath={`url(#${id})`} x={cell.x+3} y={top+font} fontSize={font}>{lines.map((line,n)=><tspan key={n} x={cell.x+3} dy={n?lineHeight:0}>{line}</tspan>)}</text>
            </g>;
          })}
        </g>
      </svg>
      <div className="esf-paper-foot">{document.scope.organization} · {document.scope.unit} · {document.scope.team} · Branco/NI ≠ zero. NA: não se aplica. A#/*: conteúdo integral no anexo. Assinaturas não são geradas.</div>
    </section>)}
    <section className="esf-paper-annex"><h2>Anexo de preenchimento e conferência</h2><p>{document.scope.organization} · {document.scope.unit} · {document.scope.team} · Competência {document.competency} · Versão {document.version} · {closed?'Snapshot de teste':'Prévia não definitiva'}.</p>
      <p>Este anexo preserva campos que não existem no papel, valores que ultrapassam a célula, referências de comprovantes e dúvidas de interpretação. Não substitui a folha original, não calcula doses e não habilita regras institucionais impressas no modelo.</p>
      {document.extras.length?<table><thead><tr><th>Referência</th><th>Campo</th><th>Valor integral</th></tr></thead><tbody>{document.extras.map((extra,i)=><tr key={i}><td>{extra.reference}</td><th scope="row">{extra.label}</th><td>{extra.value}</td></tr>)}</tbody></table>:<p>Não há valores adicionais ou conteúdo excedente.</p>}
      <p>Dados não informados não são convertidos em zero.{['medicamentos','materiais','testes-rapidos','insulinas'].includes(document.form)&&' Os totais de estoque utilizam somente as quantidades conhecidas e não incluem ressuprimento solicitado/autorizado como recebimento. Estes mapas sintéticos não movimentam o estoque operacional.'}</p>
    </section>
  </div>;
}
