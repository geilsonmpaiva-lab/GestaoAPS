import {chromium} from '@playwright/test';
import {readFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';

const origin='https://gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app';
const host=new URL(origin).hostname;
// A new, ephemeral browser: never attach to or extract the user's existing session.
const browser=await chromium.launch({headless:false,channel:'chrome'});
const context=await browser.newContext();
const page=await context.newPage();
try {
 await page.goto(origin+'/login');
 console.log('Janela isolada aberta. Entre na Vercel nesta janela; não digite a senha no chat.');
 await page.waitForURL(url=>url.hostname===host,{timeout:600_000});
 await page.getByLabel('E-mail',{exact:true}).waitFor({state:'visible',timeout:60_000});
 const cookies=(await context.cookies(origin)).filter(cookie=>!cookie.name.startsWith('sb-')).map(cookie=>({...cookie,domain:host}));
 if(!cookies.length)throw new Error('A sessão de homologação não foi confirmada.');
 console.log('SSO confirmado. Sessão mantida apenas em memória, restrita ao hostname de homologação. Aguardando liberação do Preview testado.');
 const deadline=Date.now()+900_000;
 while(!existsSync('test-results/hosted-release-ready.json')) {
  if(Date.now()>deadline)throw new Error('Liberação do Preview não confirmada no prazo.');
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 const release=JSON.parse(readFileSync('test-results/hosted-release-ready.json','utf8'));
 if(release.origin!==origin||!release.commit||release.target!=='preview')throw new Error('Destino de homologação inválido.');
 const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test','-c','playwright.staging.config.ts'],{stdio:'inherit',env:{...process.env,SGC_STAGING_APP_URL:origin,SGC_STAGING_SSO_COOKIES:JSON.stringify(cookies)}});
 const status=await new Promise(resolve=>child.on('exit',resolve));
 process.exitCode=status??1;
} catch {
 console.error('Validação hospedada interrompida. Verifique o login ou a liberação do Preview. Credenciais omitidas.');
 process.exitCode=1;
} finally {await browser.close();}
