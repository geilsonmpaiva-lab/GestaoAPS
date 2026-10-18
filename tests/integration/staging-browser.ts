import type {BrowserContext} from '@playwright/test';

export const hostedOrigin='https://gestaoaps-git-codex-cnes-ux-release-qua-lean-saude.vercel.app';
export const artifactRoot=process.env.SGC_STAGING_APP_URL===hostedOrigin?'test-results/hosted':'test-results/staging';
export async function applyStagingSso(context:BrowserContext) {
 const raw=process.env.SGC_STAGING_SSO_COOKIES;
 if(!raw)return;
 if(process.env.SGC_STAGING_APP_URL!==hostedOrigin)throw new Error('SSO permitido somente na homologação autorizada.');
 const cookies=JSON.parse(raw);
 if(!Array.isArray(cookies)||cookies.some(cookie=>cookie.domain!==new URL(hostedOrigin).hostname))throw new Error('Escopo SSO inválido.');
 await context.addCookies(cookies);
}
