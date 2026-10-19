import {chromium} from '@playwright/test';
import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';

const origin='https://gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app';
const host=new URL(origin).hostname;
const startedAt=Date.now();
let phase='abrindo-navegador';
function progress(next,extra={}) {
 phase=next;mkdirSync('test-results',{recursive:true});
 writeFileSync('test-results/hosted-session-status.json',JSON.stringify({phase,at:new Date().toISOString(),...extra}));
 console.log(`Homologação: ${phase}`);
}
// A new, ephemeral browser: never attach to or extract the user's existing session.
let browser;
try {
 progress('abrindo-navegador');
 browser=await chromium.launch({headless:false,channel:'chrome',args:['--start-maximized']});
 const context=await browser.newContext();
 const page=await context.newPage();
 progress('aguardando-sso');
 await page.goto(origin+'/login');
 await page.bringToFront();
 console.log('Janela isolada aberta. Entre na Vercel nesta janela; não digite a senha no chat.');
 await page.waitForURL(url=>url.hostname===host,{timeout:600_000});
 progress('verificando-login-sgc');
 await page.getByLabel('E-mail',{exact:true}).waitFor({state:'visible',timeout:60_000});
 const cookies=(await context.cookies(origin)).filter(cookie=>!cookie.name.startsWith('sb-')).map(cookie=>({...cookie,domain:host}));
 if(!cookies.length)throw new Error('A sessão de homologação não foi confirmada.');
 progress('sso-confirmado');
 console.log('SSO confirmado. Sessão mantida apenas em memória, restrita ao hostname de homologação. Aguardando liberação do Preview testado.');
 const deadline=Date.now()+900_000;
 while(!existsSync('test-results/hosted-release-ready.json')) {
  if(Date.now()>deadline)throw new Error('Liberação do Preview não confirmada no prazo.');
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 const release=JSON.parse(readFileSync('test-results/hosted-release-ready.json','utf8'));
 if(release.origin!==origin||!release.commit||release.target!=='preview'||Number(release.readyAt)<startedAt||!Number.isFinite(release.readyAt))throw new Error('Destino de homologação inválido ou liberação antiga.');
 progress('testes-em-execucao',{commit:release.commit});
 const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','-c','playwright.staging.config.ts'],{stdio:'inherit',env:{...process.env,SGC_STAGING_APP_URL:origin,SGC_STAGING_SSO_COOKIES:JSON.stringify(cookies)}});
 const status=await new Promise(resolve=>child.on('exit',resolve));
 progress('testes-encerrados',{exitCode:status??1});
 process.exitCode=status??1;
} catch(error) {
 const failedPhase=phase;
 progress('interrompido',{failedPhase,errorType:error?.name==='TimeoutError'?'timeout':'falha'});
 console.error(`Validação hospedada interrompida na etapa ${failedPhase}. Credenciais e detalhes de autenticação omitidos.`);
 process.exitCode=1;
} finally {await browser?.close();}
